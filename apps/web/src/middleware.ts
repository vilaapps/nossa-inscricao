import { clerkMiddleware, createRouteMatcher } from '@clerk/astro/server';
import { PrismaClient } from '@prisma/client';

const isPublicRoute = createRouteMatcher([
  '/', 
  '/eventos/(.*)', 
  '/termos',
  '/privacidade',
  '/suporte',
  '/sign-in(.*)', 
  '/sign-up(.*)'
]);

export const onRequest = clerkMiddleware(async (auth, context, next) => {
  const { userId, redirectToSignIn } = auth();

  if (!userId && !isPublicRoute(context.request)) {
    return redirectToSignIn();
  }

  // Proteger rotas /admin/* exclusivamente para role ADMIN
  const url = new URL(context.request.url);
  if (userId && url.pathname.startsWith('/admin')) {
    const prisma = new PrismaClient();
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.role !== 'ADMIN') {
        return context.redirect('/painel-organizador');
      }
    } finally {
      await prisma.$disconnect();
    }
  }

  return next();
});
