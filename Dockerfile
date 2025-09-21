# --- production only ---
FROM nginx:1.26.2-alpine3.20-slim

# Copy prebuilt SvelteKit output (make sure ./build exists from `npm run build`)
COPY ./build /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
