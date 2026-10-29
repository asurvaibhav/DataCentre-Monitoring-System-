{
  "version": 2,
  "name": "xor-ao02-platform",
  "builds": [
    {
      "src": "backend/app/main.py",
      "use": "@vercel/python"
    },
    {
      "src": "frontend/package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "dist"
      }
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "backend/app/main.py"
    },
    {
      "src": "/stream/(.*)",
      "dest": "backend/app/main.py"
    },
    {
      "src": "/docs",
      "dest": "backend/app/main.py"
    },
    {
      "src": "/openapi.json",
      "dest": "backend/app/main.py"
    },
    {
      "src": "/(.*)",
      "dest": "frontend/$1"
    }
  ]
}