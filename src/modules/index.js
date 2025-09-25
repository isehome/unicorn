// Central module registry - only export existing modules
export { default as PeopleModule } from './people';

// Export module configurations
export const moduleConfig = {
  people: {
    name: 'People',
    path: '/people',
    component: 'PeopleModule',
    icon: 'Users',
    description: 'Manage contacts and stakeholders'
  }
};