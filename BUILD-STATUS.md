# Build and test status at packaging time

- `npm test`: **passed 11/11 tests** in the local Node.js test runner.
- `node --check` for all application JavaScript modules and Vite configuration: **passed**.
- `npm install`: dependencies could not be downloaded in the packaging environment because DNS/network access to `registry.npmjs.org` was unavailable (`EAI_AGAIN`).
- Therefore `vite build`, Electron packaging and Android Gradle packaging were **not run here**. The included GitHub Actions workflow runs dependency installation, tests and platform builds after the project is pushed to GitHub.

No statement in this document should be read as a claim that an APK or Windows installer has already been built.
