# Fix: Prisma EPERM on Windows (build / prisma generate)

If you see:

```text
EPERM: operation not permitted, rename '...\node_modules\.prisma\client\query_engine-windows.dll.node.tmp...' -> '...\query_engine-windows.dll.node'
```

the Prisma query engine DLL is **locked by another process** (often Node or your editor).

## Steps

1. **Stop anything using the app**
   - Stop `npm run dev` (Ctrl+C in the terminal where it’s running).
   - Close Prisma Studio (`npm run db:studio`) if it’s open.
   - Close any other terminal or process that might be running this project.

2. **Remove the generated Prisma client**  
   In PowerShell (from the project root):

   ```powershell
   Remove-Item -Recurse -Force node_modules\.prisma
   ```

   If that fails with “Access denied”, open a **new** PowerShell window (or Command Prompt) and run the same command again with no other app using the project. As a last resort, close Cursor/VS Code and run the command from a standalone terminal.

3. **Build again**

   ```powershell
   npm run build
   ```

## Optional

- **Only run the Next.js build** (skip `prisma generate`):  
  `npm run build:next`  
  Use this only if the Prisma client was already generated successfully before (e.g. after a successful `npm run build` or `npm install`).
