import { useEffect, useMemo, useState } from 'react'

type Health = {ok:boolean; app:string; version:string; database:string}

const modules = [
  ['Tổng quan', 'Nền tảng hệ thống và trạng thái kết nối'],
  ['Sản phẩm', 'Sẽ triển khai ở V1.0'],
  ['Kho', 'Sẽ triển khai ở V1.0'],
  ['Đơn hàng', 'Sẽ triển khai ở V2.0'],
  ['Khách hàng', 'Sẽ triển khai ở V3.0'],
  ['Báo cáo', 'Sẽ triển khai ở V4.0'],
]

export default function App() {
  const isGithubPreview = useMemo(() => location.hostname.endsWith('github.io'), [])
  const [health, setHealth] = useState<Health | null>(null)
  const [active, setActive] = useState('Tổng quan')

  useEffect(() => {
    if (isGithubPreview) return
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('API unavailable'))))
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [isGithubPreview])

  const mode = isGithubPreview ? 'DEMO' : health?.ok ? 'LOCAL' : 'LOCAL / API OFFLINE'

  return (
    <div className="shell">
      <header className="topbar">
        <div><p className="eyebrow">SHOP MẸ CACAO</p><h1>Quản lý kho</h1></div>
        <span className={`badge ${mode === 'LOCAL' ? 'local' : mode === 'DEMO' ? 'demo' : 'offline'}`}>{mode}</span>
      </header>
      <div className="layout">
        <nav className="sidebar" aria-label="Điều hướng chính">
          {modules.map(([name, description]) => (
            <button key={name} className={active === name ? 'active' : ''} onClick={() => setActive(name)}>
              <strong>{name}</strong><small>{description}</small>
            </button>
          ))}
        </nav>
        <main>
          <section className="hero">
            <p className="eyebrow">BASELINE V0.1</p><h2>{active}</h2>
            <p>{active === 'Tổng quan'
              ? 'Nền móng web local-first đã sẵn sàng. Giai đoạn này chỉ xác nhận kiến trúc, chế độ chạy và khả năng build.'
              : `${active} là module dự kiến, chưa được triển khai nghiệp vụ ở baseline hiện tại.`}</p>
          </section>
          {active === 'Tổng quan' && <>
            <section className="grid">
              <article className="card"><span>Phiên bản</span><strong>V0.1</strong><p>Foundation</p></article>
              <article className="card"><span>Chế độ</span><strong>{mode}</strong><p>{isGithubPreview ? 'GitHub Pages preview' : health?.database ?? 'Đang chờ local API'}</p></article>
              <article className="card"><span>Dữ liệu thật</span><strong>{mode === 'LOCAL' ? 'Sẵn sàng' : 'Không dùng'}</strong><p>{mode === 'LOCAL' ? 'SQLite local' : 'Preview không chạm dữ liệu shop'}</p></article>
            </section>
            <section className="panel"><h3>Checkpoint hiện tại</h3><div className="checklist">
              <p>✓ React + TypeScript + PWA</p><p>✓ Node API</p><p>✓ SQLite local</p>
              <p>✓ LOCAL / DEMO mode</p><p>✓ GitHub Pages workflow</p><p>○ Product / SKU — bước tiếp theo</p>
            </div></section>
          </>}
        </main>
      </div>
    </div>
  )
}
