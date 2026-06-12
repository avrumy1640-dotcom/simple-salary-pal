import { QueryClient } from "@tanstack/react-query";
import { createRouter, ErrorComponent as DefaultErrorComponent } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
    defaultNotFoundComponent: () => (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
        <a href="/" className="mt-2 text-primary underline">Go home</a>
      </div>
    ),
  });

  return router;
};

