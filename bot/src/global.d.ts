// Node doesn't know about Vite's import.meta.env. Stub it so transitive
// imports from ../src/lib (which use `import.meta.env?.VITE_XIVAPI_BASE`)
// typecheck — the optional chaining means it harmlessly returns undefined
// at runtime in Node.
interface ImportMeta {
  env: Record<string, string | undefined>;
}
