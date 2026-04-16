import { onRequestGet as __api_font_js_onRequestGet } from "/Users/swryociao/NFB-Webapp/functions/api/font.js"
import { onRequestPost as __api_font_js_onRequestPost } from "/Users/swryociao/NFB-Webapp/functions/api/font.js"
import { onRequest as ___middleware_js_onRequest } from "/Users/swryociao/NFB-Webapp/functions/_middleware.js"

export const routes = [
    {
      routePath: "/api/font",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_font_js_onRequestGet],
    },
  {
      routePath: "/api/font",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_font_js_onRequestPost],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "",
      middlewares: [___middleware_js_onRequest],
      modules: [],
    },
  ]