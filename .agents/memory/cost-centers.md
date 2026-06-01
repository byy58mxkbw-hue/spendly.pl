---
name: api-server bundling gotcha — no direct zod imports
description: api-server uses esbuild bundle; zod is not in its deps so importing bare "zod" fails at build time. Always use schemas from @workspace/api-zod instead.
---

**Rule:** Never `import { z } from "zod"` in `artifacts/api-server/src/routes/*.ts`. esbuild marks zod as external/missing.

**Why:** The api-server bundles everything into dist/index.mjs. Packages that aren't in its `dependencies` and aren't in the `external` list in build.mjs will fail with "Could not resolve". Zod is a peer dep of api-zod lib, not a direct dep of api-server.

**How to apply:** Use `import { SomeSchema } from "@workspace/api-zod"` for all input validation in route handlers. Run codegen first if new schemas are needed.
