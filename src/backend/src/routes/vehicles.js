import { Router } from 'express'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import { attachMapPolicy, requireCompanyMapAccess } from '../middleware/mapAccess.js'
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
router.use(attachMapPolicy)

router.get(
  '/',
  requireCompanyMapAccess(),
  listVehicles,
)
router.get(
  '/:id',
  requireCompanyMapAccess(),
  getVehicle,
)
router.get(
  '/:id/location',
  requireCompanyMapAccess({ capabilities: ['map.view.vehicle_last_location'] }),
  getVehicleLastLocation,
)
router.post('/',      adminOnly,     createVehicle)
router.put('/:id',    adminOnly,     updateVehicle)
router.delete('/:id', adminOnly,     deleteVehicle)

export default router
