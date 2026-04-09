<script setup lang="ts">
import {ref} from 'vue'
import { useRouter } from 'vue-router'

//Variable reactive that are gonna be saved of what the user write
const router = useRouter() //Initializating
const email = ref('')
const password= ref('')
const error=ref('')
const loading = ref(false)

const login=()=>{
    error.value='' //Empty value

    //Validations
    if(!email.value || !password.value){
        error.value = 'Please fill all the fields'
        return
    }
    loading.value=true

    setTimeout(()=>{
        loading.value=false
        //Luego ira Firebase aqui
        router.push('/tables')
    },800)
}

</script>

<template>
    <div class="login-container">
        <div class="bg-circle circle-1"></div>
        <div class="bg-circle circle-2"></div>

        <div class="login-card">
            <div class="logo-container">
                <div class="logo-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                </div>
                <h1 class="title">EasyOrder</h1>
                <p class="subtitle">Intelligent order management</p>
            </div>
            <form @submit.prevent="login" class="form">
                <div class="input-group">
                    <label for="email">Email</label>
                    <div class="input-wrapper">
                        <svg class="input-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                        <input
                            id="email"
                            v-model="email"
                            type="email"
                            placeholder="usuario@easyorder.com"
                    />
                    </div> 
                </div>

                <div class="input-group">
                    <label for="password">Password</label>
                    <div class="input-wrapper">
                        <svg class="input-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                        <input
                            id="password"
                            v-model="password"
                            type="password"
                            placeholder="********"
                    />
                    </div>
                </div>

                <div v-if="error" class="error">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    {{ error }}
                </div>

                <button type="submit" class="btn1" :class="{ 'is-loading': loading}">
                    <span v-if="!loading">Enter</span>
                    <span v-else class="loader"></span>
                </button>
            </form>
        </div>
    </div>
</template>


<style scoped>
/*Scoped only affects styles to this .vue*/
.login-container{
    display:flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    padding: 20px;
    background-color: #f0fdfa;
    position: relative;
    overflow: hidden;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.bg-circle{
    position: absolute;
    border-radius: 50%;
    filter: blur(60px);
    z-index: 0;
}
.circle-1{
    width: 300px;
    height: 300px;
    background-color: rgba(0,153,153,0.2);
    top: -50px;
    right: -50px;
}
.circle-2{
    width: 400px;
    height: 400px;
    background-color: rgba(27,122,53,0.15);
    bottom: -100px;
    left: -100px;
}

.login-card{
    background: rgba(255, 255, 255, 0.85);
    padding: 2.5rem 2rem;
    border-radius: 24px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(255, 255, 255, 0.5) inset ;
    width: 100%;
    max-width: 400px;
    text-align: center;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    z-index: 1;
    border: 1px solid rgba(255, 255, 255, 0.3);
}

.logo-container{
    margin-bottom: 30px;
}
.logo-icon{
    background: linear-gradient(135deg, #006666 0%, #009999 100%);
    width: 70px;
    height: 70px;
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 15px auto;
    box-shadow: 0 10px 20px rgba(0, 102, 102, 0.3);
    transform: rotate(-10deg);
}

.title{
    color:#1a1a1a;
    margin-bottom: 0.25rem;
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: -0.5px;
}

.subtitle{
    color:#6b7280;
    margin-bottom: 2rem;
    font-size: 0.95rem;
    font-weight: 500;
}

.form{
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}

.input-group{
    text-align: left;
}

label{
    display: block;
    font-size: 0.85rem;
    font-weight: 600;
    color:#4b5563;
    margin-bottom: 0.5rem;
    margin-left: 4px;
}

.input-wrapper{
    position: relative;
    display: flex;
    align-items: center;
}
.input-icon{
    position: absolute;
    left: 15px;
    color:#9ca3af;
}

input{
    width: 100%;
    padding: 14px 14px 14px 45px;
    border: 2px solid #e5e7eb;
    border-radius: 16px;
    font-size: 1rem;
    box-sizing: border-box;
    background-color: white;
    transition: all 0.3s ease;
}

input:focus{
    outline: none;
    border-color: #009999;
    box-shadow: 0 0 0 4px rgba(0, 153, 153, 0.1);
}

.btn1 {
    background: linear-gradient(135deg, #006666 0%, #009999 100%);
    color: white;
    padding: 16px;
    border: none;
    border-radius: 16px;
    font-size: 1.1rem;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 8px 20px rgba(0, 102, 102, 0.3);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 54px;
}

.btn1:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 25px rgba(0, 102, 102, 0.4);
}

.btn1:active {
    transform: scale(0.96);
}

.btn1.is-loading {
    opacity: 0.9;
    cursor: not-allowed;
    transform: none;
}

.loader {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(255,255,255,0.3);
    border-radius: 50%;
    border-top-color: white;
    animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
    to{
        transform: rotate(360deg);
    }
}

.error{
    display: flex;
    align-items: center;
    gap: 8px;
    color: #ef4444;
    background-color: #fef2f2;
    padding: 12px;
    border-radius: 12px;
    font-size: 0.85rem;
    font-weight: 600;
    border: 1px solid #fecaca;
    margin: 0;
    animation: shake 0.4s ease-in-out;
}

@keyframes shake {
    0%,
    100% {
        transform: translateX(0);
    }
    25%{
        transform: translateX(-5px);
    }
    75%{
        transform: translateX(5px);
    }
}

</style>