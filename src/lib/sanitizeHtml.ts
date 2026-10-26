import sanitizeHtml from "sanitize-html";

export const cleanTemplateHtml = (html: string): string =>
  sanitizeHtml(html, {
    allowedTags: ["div", "span", "p", "h1", "h2", "h3", "img", "br", "strong", "em"],
    allowedAttributes: {
      "*": ["class", "style", "data-field"],
      img: ["src", "alt"],
    },
    allowedSchemes: ["data", "http", "https"],
    allowProtocolRelative: false,
  });

export const cleanTemplateCss = (css: string): string =>
  css
    .replace(/@import[^;]+;/gi, "")
    .replace(/url\((?!\s*["']?(?:data:|https?:))[^)]*\)/gi, "");