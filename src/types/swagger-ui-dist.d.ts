declare module "swagger-ui-dist/swagger-ui-bundle.js" {
  type SwaggerUIBundleOptions = {
    domNode?: Element | null;
    spec?: object;
    url?: string;
    docExpansion?: "list" | "full" | "none";
    deepLinking?: boolean;
    tryItOutEnabled?: boolean;
  };
  const SwaggerUIBundle: (options: SwaggerUIBundleOptions) => unknown;
  export default SwaggerUIBundle;
}

declare module "swagger-ui-dist/swagger-ui.css";
