import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import {
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getVehicleLastLocation
} from '../controllers/vehicleController.js'

const router = Router()

router.use(authMiddleware)

router.get('/',                      listVehicles)
router.get('/:id',                   getVehicle)
router.get('/:id/location',          getVehicleLastLocation)
router.post('/',      adminOnly,     createVehicle)
router.put('/:id',    adminOnly,     updateVehicle)
router.delete('/:id', adminOnly,     deleteVehicle)

export default router
