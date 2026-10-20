// prompt.txt and other text imported whole (import x from "./x.txt" with { type: "text" })
declare module "*.txt" {
  const text: string;
  export default text;
}

// a skill Illi comes with (Custom.ts), imported whole as text
declare module "*.md" {
  const text: string;
  export default text;
}
