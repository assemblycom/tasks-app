# Task App

Task App is a comprehensive task management custom app in the Assembly app store, that helps users create and manage tasks across Internal Users, Clients and Companies in the platform.

It focuses on snappy realtime functionality, notifications handling, respects user access scopes, and supports functionality across IU, Client & CRM App Preview.

It also exposes a public API accessible through the Assembly core API, allowing users to build automations that suit their use cases. Ref: [Tasks Documentation](https://docs.copilot.app/reference/tasks)

Task App uses full-stack NextJS - relying on Server + Client Components, Material UI, and `copilot-design-system` for UI, and Server Components + Actions + API Routes for server-side functionality. Supabase over Prisma powers the database operations & realtime functionality while deployment is seamlessly handled by Vercel. Trigger.dev is used as a platform for long running async tasks related to notifications.

### Project Setup

1. Clone the repository.

2. Install the dependencies using yarn

   ```shell
    yarn install
   ```

3. Run the project

   ```shell
    yarn run dev
   ```

4. Optionally, to build the project or for other scripts, please refer to the `package.json` file.

> For detailed guides related to Supabase / Trigger setup, consult our wiki

## Local supabase setup

> Note:- The supabase has configured to use ports 64323, 64321, ..etc instead of 54323 and 54321..
