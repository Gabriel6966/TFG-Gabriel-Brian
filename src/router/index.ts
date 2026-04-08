import { createRouter,createWebHistory } from "vue-router";
import LoginView from '../views/LoginView.vue'
import TablesView from '../views/MesasView.vue'

const router = createRouter({
    history:createWebHistory(),
    routes:[
        {
            path:'/',
            name:'Login',
            component:LoginView
        },
        {
            path:'/tables',
            name:'Tables',
            component:TablesView
        }
    ]
})
export default router