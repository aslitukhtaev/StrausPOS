import { Icon, Logo, type IconName } from '@/ui'
import { SectionHead } from './common'

/** Dastur versiyasi (package.json dan o'qilmaydi — qo'lda yangilanadi). */
export const APP_VERSION = '0.3.2'

const FACTS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'shield',
    title: 'Internetsiz ishlaydi',
    text: "Dastur to'liq oflayn: hech qanday server, bulut yoki internet kerak emas. Ma'lumotlar faqat shu kompyuterda."
  },
  {
    icon: 'database',
    title: "Ma'lumotlar joyi",
    text: "Baza bitta faylda: %APPDATA%\\DelfinSauna\\delfin.db. Har o'zgarishdan keyin darhol diskka yoziladi, chiroq o'chsa ham yo'qolmaydi."
  },
  {
    icon: 'download',
    title: 'Zaxira',
    text: "Kompyuter almashsa yoki buzilsa — \"Zaxira\" bo'limidan olingan nusxa bilan hammasini qaytarish mumkin."
  }
]

export function AboutSection() {
  return (
    <div className="set-section">
      <SectionHead icon="info" title="Dastur haqida" />
      <div className="set-section__body">
        <div className="set-about">
          <Logo size={72} className="set-about__logo" />
          <div>
            <div className="set-about__name">Delfin Sauna</div>
            <div className="set-about__tag">Sauna va dam olish maskanlari uchun kassa dasturi</div>
          </div>
          <div className="set-about__ver" data-testid="app-version">
            <span className="muted">Versiya</span>
            <span className="num">{APP_VERSION}</span>
          </div>
        </div>
        <div className="set-facts">
          {FACTS.map((f) => (
            <div key={f.title} className="set-fact">
              <Icon name={f.icon} size={26} className="set-fact__icon" />
              <div>
                <div className="set-fact__title">{f.title}</div>
                <div className="set-fact__text">{f.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
