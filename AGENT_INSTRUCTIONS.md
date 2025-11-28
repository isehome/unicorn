# AGENT INSTRUCTIONS - READ THIS FIRST

## 🚨 MANDATORY: Before Starting ANY Work

You MUST read and understand these files before writing any code:

1. **Read `CLAUDE.md`** - Contains all project rules, coding standards, and organization requirements
2. **Read `docs/PROJECT_OVERVIEW.md`** - Contains system architecture and how everything works
3. **Check `docs/` folder** - For topic-specific documentation on what you're working on

## Quick Rules Summary

### File Organization (Strict)
| File Type | MUST Go In |
|-----------|------------|
| React components | `src/components/` |
| Services | `src/services/` |
| API endpoints | `api/` |
| SQL migrations | `database/migrations/` |
| Documentation | `docs/` |
| NEVER in root | ❌ No .md, .sql, or random files |

### Documentation Updates (MANDATORY)
After EVERY code change, you MUST update documentation:
- New feature → Update `docs/PROJECT_OVERVIEW.md` + relevant feature doc
- Bug fix → Add to `docs/TROUBLESHOOTING.md`
- Database change → Update `docs/PROJECT_OVERVIEW.md` schema section
- API change → Update `docs/INTEGRATIONS.md`

### Database RLS (CRITICAL)
We use MSAL auth, not Supabase Auth. ALL policies need `anon`:
```sql
CREATE POLICY "name" ON table FOR ALL TO anon, authenticated USING (true);
```

### Code Standards
- React functional components with hooks
- Tailwind CSS only (include dark mode: `dark:bg-gray-800`)
- Class-based services with singleton export
- No inline styles, no CSS files

## How to Start Any Task

1. **First:** Read CLAUDE.md (full rules)
2. **Then:** Read relevant docs for the feature area
3. **Code:** Make changes following the patterns
4. **Document:** Update docs IN THE SAME RESPONSE
5. **Verify:** Check file locations are correct

## Response Format

When providing code changes, always:
1. Show exact file path
2. Provide complete, copy-paste ready code
3. Explain what changed and why
4. Include the documentation update
5. Suggest the git commit message

## Example Response Structure

```
## Changes to src/components/NewFeature.js
[complete code here]

## Changes to src/services/newService.js  
[complete code here]

## Documentation Update: docs/PROJECT_OVERVIEW.md
Add to the Features section:
[documentation addition here]

## Git Commit
```
git add -A
git commit -m "feat: Add new feature description"
```
```

## Live Documentation

After deployment, docs are available at:
- Human view: `https://[vercel-url]/docs/`
- Raw files: `https://[vercel-url]/docs/CLAUDE.md`
- File index: `https://[vercel-url]/docs/index.json`

## Project Context

- **Owner:** Steve (Intelligent Systems - low-voltage installation)
- **Technical Level:** Non-programmer, needs copy-paste ready solutions
- **Stack:** React 18, Supabase, Azure MSAL, Vercel, Tailwind
- **Integrations:** SharePoint, Lucid Charts, UniFi, Brady Printers

---

**⚠️ If you skip reading CLAUDE.md, you WILL create mess. Read it first.**