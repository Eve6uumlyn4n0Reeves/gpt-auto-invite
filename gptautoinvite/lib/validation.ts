import { z } from "zod"

const enhancedEmailSchema = z
  .string()
  .email("请输入有效的邮箱地址")
  .max(254, "邮箱地址过长")
  .refine((email) => {
    // 检查是否为常见的临时邮箱域名
    const tempEmailDomains = ["10minutemail.com", "guerrillamail.com", "mailinator.com", "tempmail.org"]
    const domain = email.split("@")[1]?.toLowerCase()
    return !tempEmailDomains.includes(domain)
  }, "不支持临时邮箱地址")

// 兑换请求验证schema
export const redeemSchema = z.object({
  code: z
    .string()
    .min(6, "兑换码至少6位")
    .max(32, "兑换码最多32位")
    .regex(/^[A-Za-z0-9-]+$/, "兑换码只能包含字母、数字和连字符"),
  email: enhancedEmailSchema,
})

// 重发邀请验证schema
export const resendSchema = z.object({
  email: enhancedEmailSchema,
  team_id: z.string().min(1, "团队ID不能为空"),
})

export const adminLoginSchema = z.object({
  password: z
    .string()
    .min(1, "密码不能为空")
    .max(128, "密码过长")
    .refine((password) => {
      // 生产环境需要更强的密码
      if (process.env.NODE_ENV === "production") {
        return password.length >= 8 && /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)
      }
      // 开发/其他环境至少 6 位
      return password.length >= 6
    }, "密码格式不正确，生产环境需要包含大小写字母和数字"),
})

export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, "请输入当前密码"),
    newPassword: z
      .string()
      .min(8, "新密码至少8个字符")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/,
        "新密码必须包含大小写字母、数字和特殊字符",
      ),
    confirmPassword: z.string().min(1, "请确认新密码"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  })

// 生成兑换码验证schema
export const generateCodesSchema = z.object({
  count: z.number().int("数量必须是整数").min(1, "至少生成1个兑换码").max(10000, "最多生成10000个兑换码"),
  prefix: z
    .string()
    .max(10, "前缀最多10个字符")
    .regex(/^[A-Za-z0-9]*$/, "前缀只能包含字母和数字")
    .optional(),
})

export const batchOperationSchema = z.object({
  action: z.enum(["disable", "enable", "delete"], {
    errorMap: () => ({ message: "无效的操作类型" }),
  }),
  ids: z.array(z.number().int().positive()).min(1, "请选择至少一个项目").max(1000, "一次最多操作1000个项目"),
  confirm: z.boolean().refine((val) => val === true, "请确认执行此操作"),
})

export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; error: string } {
  try {
    const result = schema.parse(data)
    return { success: true, data: result }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0]
      return { success: false, error: firstError.message }
    }
    return { success: false, error: "数据验证失败" }
  }
}

export function validateIPAddress(ip: string): boolean {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/
  return ipv4Regex.test(ip) || ipv6Regex.test(ip)
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 255)
}
