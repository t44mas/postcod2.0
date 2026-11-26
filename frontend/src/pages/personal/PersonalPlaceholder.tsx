import { SiteHeader } from '../../components/SiteHeader';

export function PersonalPlaceholder() {
  return <>
    <a className="skip-link" href="#main">Перейти к содержимому</a>
    <SiteHeader audience="personal"/>
    <main id="main" className="container section">
      <h1>Частным лицам</h1>
      <p>Раздел в разработке.</p>
      <a className="button primary" href="/business">Перейти к тарифам для бизнеса</a>
    </main>
  </>;
}
