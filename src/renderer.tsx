import { jsxRenderer } from 'hono/jsx-renderer'

export const renderer = jsxRenderer(({ children }) => {
  return (
    <html lang="ko">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Safety NOTE</title>
        <link rel="icon" type="image/png" href="/static/app-icon.png" />
      </head>
      <body>
        {children}
      </body>
    </html>
  )
})
