<template>
  <div class="site-layout">
    <header class="site-header">
      <div class="header-inner">
        <NuxtLink to="/" class="site-title">
          Meus Livros
        </NuxtLink>
        <nav class="site-nav" aria-label="Navegação principal">
          <slot name="nav">
            <NuxtLink to="/entrar" class="nav-link">
              Entrar
            </NuxtLink>
          </slot>
        </nav>
      </div>
    </header>

    <main class="container">
      <slot />
    </main>

    <footer class="site-footer">
      <div class="footer-inner">
        <p class="attribution">
          Dados bibliográficos parcialmente do Open Library
        </p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
// Default layout
</script>

<style scoped>
.site-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
  color: #fff;
  font-family: var(--font-sans);
}

.site-header {
  border-bottom: 1px solid var(--input-bg);
  background-color: var(--bg-color);
}

.header-inner {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-4) var(--space-5);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.site-title {
  font-size: var(--font-size-xl);
  font-weight: bold;
  color: #fff;
  text-decoration: none;
}

.site-title:hover {
  color: var(--highlight);
}

.site-title:focus-visible,
.nav-link:focus-visible {
  outline: 2px solid var(--highlight);
  outline-offset: 2px;
}

.site-nav {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.nav-link {
  color: var(--text-color);
  text-decoration: none;
  font-size: var(--font-size-sm);
  transition: color 0.2s;
}

.nav-link:hover {
  color: var(--highlight);
}

.container {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-5);
  padding-bottom: var(--space-16);
  flex: 1;
  width: 100%;
  box-sizing: border-box;
}

.site-footer {
  border-top: 1px solid var(--input-bg);
  padding: var(--space-5) 0;
  margin-top: auto;
}

.footer-inner {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 var(--space-5);
  text-align: center;
}

.attribution {
  color: var(--text-color);
  font-size: var(--font-size-xs);
  margin: 0;
}

@media (max-width: 600px) {
  .header-inner {
    padding: var(--space-3) var(--space-4);
  }

  .container {
    padding: var(--space-4);
    padding-bottom: var(--space-10);
  }

  .site-nav {
    gap: var(--space-3);
  }
}
</style>
