import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

// Dynamically set the year
const footerLink = document.querySelector('footer a');
if (footerLink) {
  footerLink.innerHTML = `Oskar Westmeijer &#129517; ${new Date().getFullYear()}`;
}

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
