import type {Metadata} from 'next';
import './globals.css';
export const metadata: Metadata={title:'Lume Studio • Estúdio de imagem',description:'Crie e edite imagens por prompt, trabalhe com prints e explore cada versão.',icons:{icon:'/img_editor/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="pt-BR"><body>{children}</body></html>;
}
