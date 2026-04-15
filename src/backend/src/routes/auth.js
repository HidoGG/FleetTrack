import { Router } from 'express'
import { login, logout, getMe, refresh } from '../controllers/authController.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

router.post('/login',   login)
router.post('/refresh', refresh)
router.post('/logout',  authMiddleware, logout)
router.get('/me',      authMiddleware, getMe)

export default router
