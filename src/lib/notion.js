// lib/notion.js
// Notion API integration for importing data to Supabase

const NOTION_API_URL = 'https://api.notion.com/v1'

// This function will help you fetch data from Notion
export const fetchNotionData = async (databaseId, notionToken) => {
  try {
    const response = await fetch(`${NOTION_API_URL}/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        page_size: 100
      })
    })

    if (!response.ok) {
      throw new Error(`Notion API error: ${response.status}`)
    }

    const data = await response.json()
    return data.results
  } catch (error) {
    console.error('Error fetching Notion data:', error)
    throw error
  }
}

// Helper function to extract text from Notion rich text objects
export const extractTextFromRichText = (richTextArray) => {
  if (!richTextArray || !Array.isArray(richTextArray)) return ''
  return richTextArray.map(item => item.plain_text || '').join('')
}

// Helper function to extract date from Notion date objects
export const extractDateFromNotionDate = (dateObject) => {
  if (!dateObject) return null
  return dateObject.start || null
}

// Helper function to extract select/multi-select values
export const extractSelectValue = (selectObject) => {
  if (!selectObject) return null
  return selectObject.name || null
}

export const extractMultiSelectValues = (multiSelectArray) => {
  if (!multiSelectArray || !Array.isArray(multiSelectArray)) return []
  return multiSelectArray.map(item => item.name)
}

// Generic function to transform Notion page data to your app's format
export const transformNotionPage = (notionPage, fieldMapping) => {
  const transformed = {
    notion_id: notionPage.id,
    created_at: notionPage.created_time,
    updated_at: notionPage.last_edited_time
  }

  // Apply field mappings
  Object.entries(fieldMapping).forEach(([supabaseField, notionConfig]) => {
    const { propertyName, type, transformer } = notionConfig
    const property = notionPage.properties[propertyName]

    if (!property) {
      transformed[supabaseField] = null
      return
    }

    let value = null

    switch (type) {
      case 'title':
      case 'rich_text':
        value = extractTextFromRichText(property[type])
        break
      case 'date':
        value = extractDateFromNotionDate(property.date)
        break
      case 'select':
        value = extractSelectValue(property.select)
        break
      case 'multi_select':
        value = extractMultiSelectValues(property.multi_select)
        break
      case 'number':
        value = property.number
        break
      case 'checkbox':
        value = property.checkbox
        break
      case 'url':
        value = property.url
        break
      case 'email':
        value = property.email
        break
      case 'phone_number':
        value = property.phone_number
        break
      default:
        value = property[type]
    }

    // Apply custom transformer if provided
    if (transformer && typeof transformer === 'function') {
      value = transformer(value, property)
    }

    transformed[supabaseField] = value
  })

  return transformed
}

// Example usage function for importing Notion data to Supabase
export const importNotionToSupabase = async (
  databaseId, 
  notionToken, 
  fieldMapping, 
  supabaseTable,
  insertDataFunction
) => {
  try {
    console.log('Fetching data from Notion...')
    const notionPages = await fetchNotionData(databaseId, notionToken)
    
    console.log(`Found ${notionPages.length} pages in Notion database`)
    
    const transformedData = notionPages.map(page => 
      transformNotionPage(page, fieldMapping)
    )
    
    console.log('Inserting data into Supabase...')
    const results = []
    
    // Insert data in batches to avoid overwhelming the database
    const batchSize = 10
    for (let i = 0; i < transformedData.length; i += batchSize) {
      const batch = transformedData.slice(i, i + batchSize)
      const batchResults = await Promise.all(
        batch.map(item => insertDataFunction(supabaseTable, item))
      )
      results.push(...batchResults)
      
      // Log progress
      console.log(`Inserted ${Math.min(i + batchSize, transformedData.length)} of ${transformedData.length} records`)
    }
    
    console.log('Import completed successfully!')
    return results
    
  } catch (error) {
    console.error('Error importing Notion data:', error)
    throw error
  }
}

// Example field mapping configuration
// This is how you would map Notion properties to your Supabase table columns
export const exampleFieldMapping = {
  // supabase_column: { propertyName: 'Notion Property Name', type: 'property_type' }
  title: { 
    propertyName: 'Name', 
    type: 'title' 
  },
  description: { 
    propertyName: 'Description', 
    type: 'rich_text' 
  },
  status: { 
    propertyName: 'Status', 
    type: 'select',
    transformer: (value) => value ? value.toLowerCase().replace(' ', '_') : 'pending'
  },
  priority: { 
    propertyName: 'Priority', 
    type: 'select' 
  },
  tags: { 
    propertyName: 'Tags', 
    type: 'multi_select' 
  },
  due_date: { 
    propertyName: 'Due Date', 
    type: 'date' 
  },
  completed: { 
    propertyName: 'Completed', 
    type: 'checkbox' 
  },
  url: { 
    propertyName: 'URL', 
    type: 'url' 
  }
}