<script setup lang="ts">
import AppNotifications from './components/AppNotifications.vue'
</script>

<template>
  <router-view />
  <AppNotifications />
</template>

<style>

html,body, #app{
  margin:0;
  padding: 0;
  width: 100%;
  height: 100vh;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background-color: #f3f4f6;
}

</style>