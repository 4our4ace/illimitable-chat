// prompt.txt and other text imported whole (import x from "./x.txt" with { type: "text" })
declare module "*.txt" {
  const text: string;
  export default text;
}
