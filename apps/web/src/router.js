import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import EditorView from './views/EditorView.vue'
import PublicView from './views/PublicView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/edit/:slug', name: 'editor', component: EditorView },
    { path: '/p/:slug', name: 'public', component: PublicView },
  ],
})

export default router
