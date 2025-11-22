/**
 * Cookie检测和提取工具
 * 用于在ChatGPT页面自动检测和提取Cookie
 */

export interface CookieInfo {
  available: boolean
  cookieString: string
  domain: string
  source: 'document' | 'manual'
}

export class CookieDetector {
  /**
   * 检测当前页面是否在ChatGPT域名下
   */
  static isChatGPTPage(): boolean {
    if (typeof window === 'undefined') return false

    const hostname = window.location.hostname
    return hostname === 'chatgpt.com' || hostname.endsWith('.chatgpt.com')
  }

  /**
   * 从当前页面提取Cookie
   */
  static extractCookieFromPage(): string {
    if (typeof document === 'undefined') return ''

    // 获取当前域名的所有Cookie
    const cookies = document.cookie
    if (!cookies) return ''

    // 过滤出ChatGPT相关的Cookie
    const relevantCookies = cookies
      .split(';')
      .map(cookie => cookie.trim())
      .filter(cookie => {
        // 保留重要的ChatGPT Cookie
        const importantCookies = [
          '__Secure-next-auth.session-token',
          'oai-did',
          'auth0',
          'session-token'
        ]
        return importantCookies.some(important =>
          cookie.startsWith(important) || cookie.includes('session')
        )
      })
      .join('; ')

    return relevantCookies
  }

  /**
   * 检测Cookie可用性
   */
  static detectCookie(): CookieInfo {
    // 检查是否在浏览器环境
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return {
        available: false,
        cookieString: '',
        domain: '',
        source: 'manual'
      }
    }

    // 检查是否在ChatGPT页面
    if (!this.isChatGPTPage()) {
      return {
        available: false,
        cookieString: '',
        domain: window.location.hostname,
        source: 'manual'
      }
    }

    // 提取Cookie
    const cookieString = this.extractCookieFromPage()

    return {
      available: cookieString.length > 0,
      cookieString,
      domain: window.location.hostname,
      source: 'document'
    }
  }

  /**
   * 验证Cookie格式
   */
  static validateCookieFormat(cookieString: string): {
    valid: boolean
    issues: string[]
  } {
    const issues: string[] = []

    if (!cookieString || cookieString.trim().length === 0) {
      issues.push('Cookie字符串为空')
      return { valid: false, issues }
    }

    // 仅做轻量长度检查；权威校验由后端完成
    if (cookieString.length < 50) {
      issues.push('Cookie字符串可能不完整（长度 < 50）')
    }

    // 检查格式
    const cookiePairs = cookieString.split(';')
    if (cookiePairs.length < 2) {
      issues.push('Cookie格式可能不正确，应该包含多个键值对')
    }

    return {
      valid: issues.length === 0,
      issues
    }
  }

  /**
   * 获取Cookie使用说明
   */
  static getCookieInstructions(): {
    title: string
    steps: string[]
    tips: string[]
  } {
    return {
      title: '如何获取ChatGPT Cookie',
      steps: [
        '1. 打开ChatGPT官网 (https://chatgpt.com)',
        '2. 确保已登录你的账户',
        '3. 按 F12 打开开发者工具',
        '4. 点击 "Application" (应用) 标签',
        '5. 在左侧找到 "Cookies" -> "https://chatgpt.com"',
        '6. 复制所有Cookie值（特别是 __Secure-next-auth.session-token）',
        '7. 将Cookie粘贴到下方输入框'
      ],
      tips: [
        '如果已在ChatGPT页面，系统会自动检测Cookie',
        'Cookie包含敏感信息，请妥善保管',
        'Cookie有效期通常为30天',
        '如果Cookie失效，需要重新登录获取'
      ]
    }
  }
}
