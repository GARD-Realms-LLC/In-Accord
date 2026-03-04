import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware({
    privateRoutes: ["/api/uploadthing"]
});
