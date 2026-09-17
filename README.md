# virtualis-frontend

The web UI of [Virtualis](https://github.com/SakuraOpenSource/virtualis), a single-admin master for remote VM and container agents. Built as a single-page application and normally delivered embedded inside the Virtualis single binary.

## Tech stack

- Vite + Vue 3 + TypeScript
- [shadcn-vue](https://www.shadcn-vue.com/)-style components built on [reka-ui](https://reka-ui.com/)
- Tailwind CSS
- vue-router (history mode), pinia, axios

## Development

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

The Virtualis backend must be running at the same time (`make backend` or `go run ./cmd/virtualis -debug` in the backend repository); the dev server proxies `/api` to it.

```bash
pnpm build      # vue-tsc -b && vite build, output in dist/
pnpm preview
```

Running `make build` in the backend repository builds this project and embeds the output into the backend binary.

## Highlights

- Instance management (QEMU VMs and LXC/Incus containers) with per-driver options
- noVNC console for QEMU instances through the master's WebSocket proxy
- Live metrics charts and network inspection views
- NAT port mapping management per instance
- Fractional CPU input for instances backed by `cpu_milli` limits

## License

This project is licensed under GPL-v3.
