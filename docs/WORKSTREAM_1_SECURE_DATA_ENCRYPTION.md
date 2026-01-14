# Workstream 1: Secure Data Encryption Implementation

## Overview

**Problem:** All secure data (passwords, credentials, API keys) is currently stored as plaintext in Supabase. This is a critical security issue that must be resolved before adding more sensitive data (Home Assistant tokens, etc.).

**Solution:** Implement Supabase Vault encryption for all sensitive fields.

**Priority:** HIGH - Must complete before Workstream 2 (Home Assistant Integration)

---

## Current State Audit

### Database Tables Storing Sensitive Data

| Table | Sensitive Fields | Row Count | Notes |
|-------|------------------|-----------|-------|
| `project_secure_data` | `password`, `username`, `url`, `ip_address` | Check DB | Project-scoped credentials |
| `contact_secure_data` | `password`, `username`, `url`, `ip_address` | Check DB | Contact-scoped credentials |
| `equipment_credentials` | Junction table only | N/A | Links secure_data to equipment |

### UI Components That Read/Write Secure Data

| Component | File Path | Scope | Database Table |
|-----------|-----------|-------|----------------|
| SecureDataPage | `src/components/SecureDataPage.js` | Project | `project_secure_data` |
| SecureDataManager | `src/components/SecureDataManager.js` | Project | `project_secure_data` |
| ContactDetailPage | `src/components/ContactDetailPage.js` | Contact | `contact_secure_data` |
| SecureDataDebug | `src/components/SecureDataDebug.js` | Debug/Test | `project_secure_data` |

### Service Layer

| Service | File Path | Methods |
|---------|-----------|---------|
| `secureDataService` | `src/services/equipmentService.js` (lines 548-739) | `create`, `update`, `getById`, `getProjectSecureData`, `getForEquipment` |
| `contactSecureDataService` | `src/services/equipmentService.js` (lines 740-900+) | `create`, `update`, `getById`, `getForContact` |

---

## Implementation Plan

### Phase 1: Enable Supabase Vault

1. **Enable the `vault` extension in Supabase**
   ```sql
   CREATE EXTENSION IF NOT EXISTS vault WITH SCHEMA vault;
   ```

2. **Create encryption keys for each sensitive table**
   ```sql
   -- Create a key for project secure data
   SELECT vault.create_secret(
     'project_secure_data_key',
     gen_random_bytes(32)::text,
     'Encryption key for project_secure_data table'
   );

   -- Create a key for contact secure data
   SELECT vault.create_secret(
     'contact_secure_data_key',
     gen_random_bytes(32)::text,
     'Encryption key for contact_secure_data table'
   );
   ```

### Phase 2: Create Encrypted Columns

1. **Add encrypted columns to `project_secure_data`**
   ```sql
   ALTER TABLE project_secure_data
   ADD COLUMN password_encrypted bytea,
   ADD COLUMN username_encrypted bytea,
   ADD COLUMN url_encrypted bytea,
   ADD COLUMN ip_address_encrypted bytea;
   ```

2. **Add encrypted columns to `contact_secure_data`**
   ```sql
   ALTER TABLE contact_secure_data
   ADD COLUMN password_encrypted bytea,
   ADD COLUMN username_encrypted bytea,
   ADD COLUMN url_encrypted bytea,
   ADD COLUMN ip_address_encrypted bytea;
   ```

### Phase 3: Create Encrypt/Decrypt Functions

```sql
-- Encrypt function
CREATE OR REPLACE FUNCTION encrypt_sensitive_data(plaintext text, key_name text)
RETURNS bytea AS $$
DECLARE
  key_value bytea;
BEGIN
  SELECT decrypted_secret INTO key_value
  FROM vault.decrypted_secrets
  WHERE name = key_name;

  RETURN pgsodium.crypto_secretbox(
    convert_to(plaintext, 'utf8'),
    pgsodium.crypto_secretbox_noncegen(),
    key_value
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decrypt function
CREATE OR REPLACE FUNCTION decrypt_sensitive_data(ciphertext bytea, key_name text)
RETURNS text AS $$
DECLARE
  key_value bytea;
BEGIN
  SELECT decrypted_secret INTO key_value
  FROM vault.decrypted_secrets
  WHERE name = key_name;

  RETURN convert_from(
    pgsodium.crypto_secretbox_open(ciphertext, key_value),
    'utf8'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Phase 4: Migrate Existing Data

**CRITICAL: Run this migration during a maintenance window**

```sql
-- Migrate project_secure_data
UPDATE project_secure_data
SET
  password_encrypted = CASE WHEN password IS NOT NULL
    THEN encrypt_sensitive_data(password, 'project_secure_data_key')
    ELSE NULL END,
  username_encrypted = CASE WHEN username IS NOT NULL
    THEN encrypt_sensitive_data(username, 'project_secure_data_key')
    ELSE NULL END,
  url_encrypted = CASE WHEN url IS NOT NULL
    THEN encrypt_sensitive_data(url, 'project_secure_data_key')
    ELSE NULL END,
  ip_address_encrypted = CASE WHEN ip_address IS NOT NULL
    THEN encrypt_sensitive_data(ip_address, 'project_secure_data_key')
    ELSE NULL END
WHERE password IS NOT NULL OR username IS NOT NULL;

-- Migrate contact_secure_data
UPDATE contact_secure_data
SET
  password_encrypted = CASE WHEN password IS NOT NULL
    THEN encrypt_sensitive_data(password, 'contact_secure_data_key')
    ELSE NULL END,
  username_encrypted = CASE WHEN username IS NOT NULL
    THEN encrypt_sensitive_data(username, 'contact_secure_data_key')
    ELSE NULL END,
  url_encrypted = CASE WHEN url IS NOT NULL
    THEN encrypt_sensitive_data(url, 'contact_secure_data_key')
    ELSE NULL END,
  ip_address_encrypted = CASE WHEN ip_address IS NOT NULL
    THEN encrypt_sensitive_data(ip_address, 'contact_secure_data_key')
    ELSE NULL END
WHERE password IS NOT NULL OR username IS NOT NULL;
```

### Phase 5: Create Secure Views

Instead of modifying all the frontend code, create views that automatically decrypt:

```sql
-- Secure view for project_secure_data
CREATE OR REPLACE VIEW project_secure_data_decrypted AS
SELECT
  id,
  project_id,
  equipment_id,
  data_type,
  name,
  decrypt_sensitive_data(username_encrypted, 'project_secure_data_key') as username,
  decrypt_sensitive_data(password_encrypted, 'project_secure_data_key') as password,
  decrypt_sensitive_data(url_encrypted, 'project_secure_data_key') as url,
  decrypt_sensitive_data(ip_address_encrypted, 'project_secure_data_key') as ip_address,
  port,
  additional_info,
  notes,
  created_at,
  updated_at,
  created_by,
  last_accessed
FROM project_secure_data;

-- Secure view for contact_secure_data
CREATE OR REPLACE VIEW contact_secure_data_decrypted AS
SELECT
  id,
  contact_id,
  data_type,
  name,
  decrypt_sensitive_data(username_encrypted, 'contact_secure_data_key') as username,
  decrypt_sensitive_data(password_encrypted, 'contact_secure_data_key') as password,
  decrypt_sensitive_data(url_encrypted, 'contact_secure_data_key') as url,
  decrypt_sensitive_data(ip_address_encrypted, 'contact_secure_data_key') as ip_address,
  port,
  notes,
  additional_info,
  created_at,
  updated_at,
  created_by
FROM contact_secure_data;
```

### Phase 6: Update Service Layer

**File:** `src/services/equipmentService.js`

#### Update `secureDataService.create()` (around line 640)

```javascript
async create(secureData) {
  // Call RPC function that handles encryption
  const { data, error } = await supabase.rpc('create_project_secure_data', {
    p_project_id: secureData.project_id,
    p_equipment_id: secureData.equipment_id || null,
    p_data_type: secureData.data_type || 'other',
    p_name: secureData.name,
    p_username: secureData.username || null,
    p_password: secureData.password || null,
    p_url: secureData.url || null,
    p_ip_address: secureData.ip_address || null,
    p_port: secureData.port || null,
    p_notes: secureData.notes || null,
    p_created_by: secureData.created_by || null
  });

  if (error) throw error;
  return data;
}
```

#### Update `secureDataService.getProjectSecureData()` (around line 560)

```javascript
async getProjectSecureData(projectId) {
  // Use the decrypted view instead of the raw table
  const { data, error } = await supabase
    .from('project_secure_data_decrypted')
    .select('*')
    .eq('project_id', projectId)
    .order('name');

  if (error) throw error;
  return data || [];
}
```

Similar updates needed for:
- `secureDataService.getById()`
- `secureDataService.getForEquipment()`
- `secureDataService.update()`
- `contactSecureDataService.create()`
- `contactSecureDataService.getForContact()`
- `contactSecureDataService.getById()`
- `contactSecureDataService.update()`

### Phase 7: Create RPC Functions for Insert/Update

```sql
-- RPC function for creating encrypted project secure data
CREATE OR REPLACE FUNCTION create_project_secure_data(
  p_project_id uuid,
  p_equipment_id uuid,
  p_data_type text,
  p_name text,
  p_username text,
  p_password text,
  p_url text,
  p_ip_address text,
  p_port integer,
  p_notes text,
  p_created_by uuid
) RETURNS uuid AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO project_secure_data (
    project_id, equipment_id, data_type, name,
    username_encrypted, password_encrypted, url_encrypted, ip_address_encrypted,
    port, notes, created_by
  ) VALUES (
    p_project_id, p_equipment_id, p_data_type, p_name,
    CASE WHEN p_username IS NOT NULL THEN encrypt_sensitive_data(p_username, 'project_secure_data_key') END,
    CASE WHEN p_password IS NOT NULL THEN encrypt_sensitive_data(p_password, 'project_secure_data_key') END,
    CASE WHEN p_url IS NOT NULL THEN encrypt_sensitive_data(p_url, 'project_secure_data_key') END,
    CASE WHEN p_ip_address IS NOT NULL THEN encrypt_sensitive_data(p_ip_address, 'project_secure_data_key') END,
    p_port, p_notes, p_created_by
  ) RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Similar function for contact_secure_data
CREATE OR REPLACE FUNCTION create_contact_secure_data(
  p_contact_id uuid,
  p_data_type text,
  p_name text,
  p_username text,
  p_password text,
  p_url text,
  p_ip_address text,
  p_port integer,
  p_notes text,
  p_created_by uuid
) RETURNS uuid AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO contact_secure_data (
    contact_id, data_type, name,
    username_encrypted, password_encrypted, url_encrypted, ip_address_encrypted,
    port, notes, created_by
  ) VALUES (
    p_contact_id, p_data_type, p_name,
    CASE WHEN p_username IS NOT NULL THEN encrypt_sensitive_data(p_username, 'contact_secure_data_key') END,
    CASE WHEN p_password IS NOT NULL THEN encrypt_sensitive_data(p_password, 'contact_secure_data_key') END,
    CASE WHEN p_url IS NOT NULL THEN encrypt_sensitive_data(p_url, 'contact_secure_data_key') END,
    CASE WHEN p_ip_address IS NOT NULL THEN encrypt_sensitive_data(p_ip_address, 'contact_secure_data_key') END,
    p_port, p_notes, p_created_by
  ) RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Phase 8: Remove Plaintext Columns (After Verification)

**ONLY after confirming encrypted data is working correctly:**

```sql
-- Remove plaintext columns from project_secure_data
ALTER TABLE project_secure_data
DROP COLUMN password,
DROP COLUMN username,
DROP COLUMN url,
DROP COLUMN ip_address;

-- Remove plaintext columns from contact_secure_data
ALTER TABLE contact_secure_data
DROP COLUMN password,
DROP COLUMN username,
DROP COLUMN url,
DROP COLUMN ip_address;
```

---

## Files to Modify

### Frontend Components (Read Operations)
These should work without changes if using decrypted views:
- `src/components/SecureDataPage.js` - May need minor updates if not using service layer
- `src/components/SecureDataManager.js` - May need minor updates
- `src/components/ContactDetailPage.js` - May need minor updates

### Service Layer (Critical Changes)
- `src/services/equipmentService.js` - Update all secure data methods to use RPC functions and decrypted views

### Database Migrations
Create new migration file:
- `database/migrations/YYYYMMDD_encrypt_secure_data.sql`

---

## Testing Checklist

### Pre-Migration
- [ ] Count existing records in `project_secure_data`
- [ ] Count existing records in `contact_secure_data`
- [ ] Export backup of both tables
- [ ] Test in development environment first

### Post-Migration
- [ ] Verify encrypted columns contain data (not null)
- [ ] Verify decrypted views return correct data
- [ ] Test creating new secure data entry (project scope)
- [ ] Test creating new secure data entry (contact scope)
- [ ] Test viewing password (eye icon toggle)
- [ ] Test copying credentials to clipboard
- [ ] Test updating existing credentials
- [ ] Test deleting credentials
- [ ] Verify audit logs still work
- [ ] Test equipment credential linking
- [ ] Verify no plaintext passwords in database

### UI Testing
- [ ] SecureDataPage - List, Create, Edit, Delete, View Password
- [ ] SecureDataManager modal - All operations
- [ ] ContactDetailPage secure data section - All operations
- [ ] Equipment credentials section - Link/unlink operations

---

## Rollback Plan

If issues are found:

1. **Keep plaintext columns until verified** - Don't drop them in Phase 8 until fully tested
2. **Restore from backup** if data corruption occurs
3. **Revert service layer changes** to use direct table access

```sql
-- Emergency: Copy encrypted data back to plaintext (if needed for rollback)
UPDATE project_secure_data
SET
  password = decrypt_sensitive_data(password_encrypted, 'project_secure_data_key'),
  username = decrypt_sensitive_data(username_encrypted, 'project_secure_data_key')
WHERE password_encrypted IS NOT NULL;
```

---

## Security Notes

1. **Encryption keys are stored in Supabase Vault** - Only accessible via `SECURITY DEFINER` functions
2. **RLS policies remain in effect** - Users can only access their authorized data
3. **Audit logging continues to work** - No changes needed to audit trail
4. **Decryption happens server-side** - Plaintext never stored, only transmitted over HTTPS

---

## Additional Issue Found: ContactDetailPage Navigation

**Issue:** ContactDetailPage has a back button inside the page instead of using the top app bar for navigation (not following app standards).

**Recommendation:** Fix this in a separate task after encryption is complete. Low priority.

---

## Timeline Estimate

| Phase | Estimated Time | Notes |
|-------|----------------|-------|
| Phase 1-3 (DB Setup) | 2 hours | SQL migrations |
| Phase 4 (Data Migration) | 1 hour | Run during maintenance |
| Phase 5-7 (Views & Functions) | 3 hours | SQL + testing |
| Phase 6 (Service Layer) | 4 hours | JavaScript changes |
| Testing | 4 hours | Full regression test |
| Phase 8 (Cleanup) | 30 min | After 1 week verification |

**Total: ~14-16 hours**

---

## Questions for Steve

1. Should we schedule a maintenance window for the data migration?
2. Do you want to test this in a staging environment first?
3. Are there any other fields that should be encrypted (notes, additional_info)?
