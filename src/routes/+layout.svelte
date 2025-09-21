<script lang="ts">
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <link rel="icon" href="/favicon.ico" type="image/x-icon" />
  <title>Maps • Oskar Westmeijer</title>
</svelte:head>

<!-- Flex column wrapper -->
<div class="flex flex-col min-h-screen bg-base-100">
  <!-- Navbar -->
  <div class="navbar glass">
    <div class="navbar-start">
      <div class="mobile-hide">
        <a
          href="https://oskar-westmeijer.com"
          class="btn btn-ghost rounded-lg text-xl font-bold"
          >&#129517; Maps</a
        >
      </div>
    </div>
    <div class="navbar-center">
      <a href="/" class="btn btn-ghost text-xl">🗺️ Gallery</a>
      <a href="/about" class="btn btn-ghost text-xl">🔮 About</a>
    </div>
    <div class="navbar-end">
      <div class="mobile-hide">
        <a
          href="https://github.com/OskarWestmeijer/maps"
          aria-label="Oskar Westmeijer Github maps repository"
        >
          <button class="btn btn-ghost rounded-lg">
            <img alt="Github logo" class="size-6" src="/github.svg" />
          </button>
        </a>
      </div>
    </div>
  </div>

  <!-- Main grows to push footer down -->
  <main class="flex-grow">
    {@render children?.()}
  </main>

  <!-- Footer -->
  <footer class="footer footer-center py-6">
    <a href="https://oskar-westmeijer.com" class="btn btn-ghost text-xl">
      Oskar Westmeijer &#129517; 2025
    </a>
  </footer>
</div>
