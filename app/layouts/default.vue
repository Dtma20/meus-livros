<template>
  <div class="site-layout">
    <a href="#conteudo-principal" class="skip-link">
      Pular para o conteúdo
    </a>

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

    <main id="conteudo-principal" class="container" tabindex="-1">
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

.skip-link {
  position: absolute;
  top: -100px;
  left: var(--space-4);
  background-color: var(--highlight);
  color: #14181c;
  padding: var(--space-2) var(--space-4);
  font-weight: 700;
  font-size: var(--font-size-sm);
  text-decoration: none;
  border-radius: var(--radius-sm);
  z-index: 1000;
  transition: top 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.skip-link:focus,
.skip-link:focus-visible {
  top: var(--space-4);
  outline: 2px solid #fff;
  outline-offset: 2px;
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
  min-height: 28px;
  display: inline-flex;
  align-items: center;
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

.container:focus {
  outline: none;
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
