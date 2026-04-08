<script setup lang="ts">
import {ref} from 'vue'

//Variables reactivas que se guardaran a la hora de que el usuario escriba algo
const email = ref('')
const password= ref('')
const error=ref('')

const login=()=>{
    error.value='' //Vaciamos

    if(!email.value || !password.value){
        error.value = 'Por favor, rellena todos los campos'
        return
    }
    //Simulacion del login(luego se conectara con Firebase)
    console.log('Intentando hacer login con:', email.value)
    alert(`Login simulado para: ${email.value}`)
}

</script>

<template>
    <div class="login-container">
        <div class="login-card">
            <h1 class="title">EasyOrder</h1>
            <p class="subtitle">Intelligent order management</p>

            <form @submit.prevent="login" class="form">
                <div class="input-group">
                    <label for="email">Email</label>
                    <input
                    id="email"
                    v-model="email"
                    type="email"
                    placeholder="usuario@easyorder.com"
                    />
                </div>

                <div class="input-group">
                    <label for="password">Password</label>
                    <input
                    id="password"
                    v-model="password"
                    type="password"
                    placeholder="********"
                    />
                </div>

                <p v-if="error" class="error">{{ error }}</p>

                <button type="submit" class="btn1">Enter</button>
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
}

.login-card{
    background: white;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    width: 100%;
    max-width: 400px;
    text-align: center;
}

.title{
    color:#2563eb;
    margin-bottom: 0.5rem;
    font-size: 2rem;
}

.subtitle{
    color:#6b7280;
    margin-bottom: 2rem;
    font-size: 0.9rem;
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
    font-size: 0.875rem;
    font-weight: 600;
    color:#374151;
    margin-bottom: 0.5rem;
}

input{
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 1rem;
    box-sizing: border-box;
}

.input:focus{
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37,99,235,0.2);
}

.btn1{
    background-color: #2563eb;
    color: white;
    padding: 0.75rem;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: bold;
    cursor: pointer;
    transition: background-color 0.2s;
}

.btn1:hover{
    background-color: #1d4ed8;
}
.error{
    color:red;
    font-size: 0.875rem;
    margin: 0;
}

</style>