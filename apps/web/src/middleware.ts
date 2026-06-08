import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';

const isPublicRoute = createRouteMatcher([
  '/', 
  '/eventos/(.*)', 
  '/sign-in(.*)', 
  '/sign-up(.*)'
]);

export const onRequest = clerkMiddleware((auth, context) => {
  const { userId, redirectToSignIn } = auth();
  if (!userId && !isPublicRoute(context.request)) {
    return redirectToSignIn();
  }
});
