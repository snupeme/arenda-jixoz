// Standalone (CSS faylsiz) xato sahifasi. Ranglar src/styles.css dagi
// design tokenlarni takrorlaydi — bitta manba sifatida shu yerda
// CSS o'zgaruvchilarida saqlanadi.
export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        --background: #f5f7f5;
        --foreground: #131715;
        --card: #ffffff;
        --muted-foreground: #57605b;
        --primary: #14604a;
        --primary-foreground: #ffffff;
        --border: #d5dcd6;
      }
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: var(--background); color: var(--foreground); display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; background: var(--card); border: 1px solid var(--border); border-radius: 12px; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: var(--muted-foreground); margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 8px; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: var(--primary); color: var(--primary-foreground); }
      .secondary { background: var(--card); color: var(--foreground); border-color: var(--border); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
