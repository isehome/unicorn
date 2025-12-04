-- Create todo_stakeholders table
CREATE TABLE IF NOT EXISTS public.todo_stakeholders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    todo_id UUID NOT NULL REFERENCES public.project_todos(id) ON DELETE CASCADE,
    project_stakeholder_id UUID NOT NULL REFERENCES public.project_stakeholders(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(todo_id, project_stakeholder_id)
);

-- Enable RLS
ALTER TABLE public.todo_stakeholders ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to view
CREATE POLICY "Users can view todo stakeholders" ON public.todo_stakeholders
    FOR SELECT USING (auth.role() = 'authenticated');

-- Create policy to allow authenticated users to insert
CREATE POLICY "Users can insert todo stakeholders" ON public.todo_stakeholders
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Create policy to allow authenticated users to delete
CREATE POLICY "Users can delete todo stakeholders" ON public.todo_stakeholders
    FOR DELETE USING (auth.role() = 'authenticated');
