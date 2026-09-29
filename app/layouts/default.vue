<template>
  <div class="site-layout">
    <a href="#conteudo-principal" class="skip-link">
      Pular para o conteúdo
    </a>

    <header class="site-header">
      <div class="header-inner">
        <NuxtLink to="/" class="site-title">
          <AppLogo :size="28" />
          <span>Meus Livros</span>
        </NuxtLink>
        <HeaderSearch />
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
          Capas de livros via Open Library
        </p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import AppLogo from '~/components/ui/AppLogo.vue'
import HeaderSearch from '~/components/search/HeaderSearch.vue'
</script>

<style scoped>
.site-layout {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
  color: #fff;
  font-family: var(--font-sans);
}

.site-header {
  border-bottom: 1px solid var(--input-bg);
  background-color: var(--bg-color);
  position: relative;
  z-index: 100;
}

.header-inner {
  width: 100%;
  box-sizing: border-box;
  padding: var(--space-3) var(--space-8);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.skip-link {
  position: absolute;
  top: -100px;
  left: var(--space-4);
  background-color: var(--highlight);
  color: var(--bg-color);
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
  outline: 2px solid var(--poster-border);
  outline-offset: 2px;
}

.site-title {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-serif);
  font-size: var(--font-size-xl);
  font-weight: 600;
  letter-spacing: -0.015em;
  color: #fff;
  text-decoration: none;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
  background-color: transparent;
  transition: background-color 0.15s ease, color 0.15s ease;
  flex-shrink: 0;
}

.site-title:hover {
  background-color: var(--card-bg);
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
  gap: var(--space-3);
  flex-wrap: wrap;
}

.nav-link {
  color: var(--text-color);
  text-decoration: none;
  font-size: var(--font-size-sm);
  min-height: 28px;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  background-color: transparent;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.nav-link:hover {
  background-color: var(--card-bg);
  color: var(--highlight);
}

.container {
  margin: 0 auto;
  padding: var(--space-5) var(--space-8);
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
  margin: 0 auto;
  padding: 0 var(--space-8);
  text-align: center;
}

.attribution {
  color: var(--text-color);
  font-size: var(--font-size-xs);
  margin: 0;
}

@media (max-width: 767.98px) {
  .site-title {
    min-height: var(--target-min-size);
    box-sizing: border-box;
  }

  .nav-link {
    min-height: var(--target-min-size);
    min-width: var(--target-min-size);
    box-sizing: border-box;
    justify-content: center;
  }
}

@media (max-width: 600px) {
  .header-inner {
    padding: var(--space-3) var(--space-4);
  }

  .container {
    padding: var(--space-4);
    padding-bottom: var(--space-10);
  }

  .footer-inner {
    padding: 0 var(--space-4);
  }

  .site-nav {
    gap: var(--space-3);
  }

  .site-title {
    font-size: var(--font-size-lg);
  }
}

@media (max-width: 400px) {
  .header-inner {
    padding: var(--space-3) var(--space-2);
    gap: var(--space-2);
  }

  .site-title {
    padding: var(--space-1) var(--space-2);
  }
}
</style>
