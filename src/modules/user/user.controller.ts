import { apiController, AppOk } from "../../shared/index.js";
import { userService } from "./user.service.js";

export const getMe = apiController(async (req) => {
  const user = await userService.getMe(req.userId!);
  return AppOk.ok({ data: user });
});

export const updateMe = apiController(async (req) => {
  const updated = await userService.updateMe(req.userId!, req.body);
  return AppOk.ok({ data: updated, message: "Profile updated successfully" });
});
