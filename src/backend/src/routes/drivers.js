import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import {
  listDrivers,
  getDriver,
  getMyDriver,
  createDriver,
  updateDriver,
  deleteDriver
} from '../controllers/driverController.js'

const router = Router()

router.use(authMiddleware)

router.get('/me',         getMyDriver)   // conductor del usuario actual
router.get('/',           listDrivers)
router.get('/:id',        getDriver)
router.post('/',          adminOnly, createDriver)
router.put('/:id',        adminOnly, updateDriver)
router.delete('/:id',     adminOnly, deleteDriver)

export default router
