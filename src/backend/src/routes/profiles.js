import { Router } from 'express'
import { authMiddleware, superAdminOnly } from '../middleware/auth.js'
import { setProfileState } from '../controllers/profilesController.js'

const router = Router()

router.use(authMiddleware, superAdminOnly)

router.patch('/:id/state', setProfileState)

export default router
