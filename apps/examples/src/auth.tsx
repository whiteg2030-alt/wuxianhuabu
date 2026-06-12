import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import './auth.css'

interface AuthSession {
	email: string
	name: string
}

interface AuthContextValue {
	user: AuthSession | null
	isCheckingSession: boolean
	login(email: string, password: string): Promise<void>
	register(name: string, email: string, password: string): Promise<void>
	logout(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<AuthSession | null>(null)
	const [isCheckingSession, setIsCheckingSession] = useState(true)

	useEffect(() => {
		let cancelled = false
		requestAuth<{ user: AuthSession | null }>('/api/auth/session')
			.then((data) => {
				if (!cancelled) setUser(data.user)
			})
			.catch(() => {
				if (!cancelled) setUser(null)
			})
			.finally(() => {
				if (!cancelled) setIsCheckingSession(false)
			})
		return () => {
			cancelled = true
		}
	}, [])

	const value = useMemo<AuthContextValue>(
		() => ({
			user,
			isCheckingSession,
			async login(email, password) {
				const data = await requestAuth<{ user: AuthSession }>('/api/auth/login', {
					email,
					password,
				})
				setUser(data.user)
			},
			async register(name, email, password) {
				const data = await requestAuth<{ user: AuthSession }>('/api/auth/register', {
					name,
					email,
					password,
				})
				setUser(data.user)
			},
			async logout() {
				await requestAuth('/api/auth/logout', {})
				setUser(null)
			},
		}),
		[isCheckingSession, user]
	)

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function AuthGate({ children }: { children: React.ReactNode }) {
	const auth = useAuth()
	if (auth.isCheckingSession) {
		return (
			<div className="auth-screen">
				<div className="auth-screen__panel auth-screen__panel--compact">正在检查登录状态...</div>
			</div>
		)
	}
	if (auth.user) return children
	return <LoginScreen />
}

export function useAuth() {
	const context = useContext(AuthContext)
	if (!context) throw new Error('useAuth must be used within AuthProvider')
	return context
}

function LoginScreen() {
	const auth = useAuth()
	const [mode, setMode] = useState<'login' | 'register'>('login')
	const [name, setName] = useState('')
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [isSubmitting, setIsSubmitting] = useState(false)

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setError(null)
		setIsSubmitting(true)
		try {
			if (mode === 'login') {
				await auth.login(email, password)
			} else {
				await auth.register(name, email, password)
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : '认证失败')
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<div className="auth-screen">
			<div className="auth-screen__panel">
				<div className="auth-screen__brand">
					<div className="auth-screen__mark">tl</div>
					<div>
						<h1>图像流画布</h1>
						<p>登录后进入中文图片节点工作流。</p>
					</div>
				</div>

				<div className="auth-screen__mode" role="tablist" aria-label="认证方式">
					<button
						type="button"
						className="auth-screen__mode-button"
						data-active={mode === 'login'}
						onClick={() => {
							setMode('login')
							setError(null)
						}}
					>
						登录
					</button>
					<button
						type="button"
						className="auth-screen__mode-button"
						data-active={mode === 'register'}
						onClick={() => {
							setMode('register')
							setError(null)
						}}
					>
						注册
					</button>
				</div>

				<form className="auth-screen__form" onSubmit={handleSubmit}>
					{mode === 'register' && (
						<label>
							<span>名称</span>
							<input
								value={name}
								onChange={(event) => setName(event.target.value)}
								autoComplete="name"
								placeholder="产品设计师"
							/>
						</label>
					)}
					<label>
						<span>邮箱</span>
						<input
							type="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							autoComplete="email"
							placeholder="you@example.com"
						/>
					</label>
					<label>
						<span>密码</span>
						<input
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
							placeholder="至少 6 位字符"
						/>
					</label>
					{error && <div className="auth-screen__error">{error}</div>}
					<button className="auth-screen__submit" type="submit" disabled={isSubmitting}>
						{isSubmitting ? '处理中...' : mode === 'login' ? '登录' : '创建账号'}
					</button>
				</form>
			</div>
		</div>
	)
}

async function requestAuth<T = unknown>(url: string, body?: unknown) {
	const response = await fetch(url, {
		method: body ? 'POST' : 'GET',
		headers: body ? { 'Content-Type': 'application/json' } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	})
	const data = await response.json()
	if (!response.ok) {
		throw new Error(data?.error || '认证请求失败')
	}
	return data as T
}
