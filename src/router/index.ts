import { createRouter,createWebHistory } from "vue-router";
import LoginView from '../views/LoginView.vue'
import TablesView from '../views/MesasView.vue'
import MenuView from '../views/MenuView.vue'

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
        },
        {
            path:'/menu/:id',
            name:'Menu',
            component:MenuView
        }
    ]
})
export default router