# Simulador 3D de Tanque Industrial com Agitador Mecânico (5m × 5m × 4m)

**Desenvolvedor:** Gilson Bolivar  
**Aplicação:** Simulação de Mecânica dos Fluidos, Mistura e Decantação de Sólidos em Meio Heterogêneo.

---

## 📌 Visão Geral do Projeto

Este projeto consiste em uma aplicação web interativa em **React 19 + TypeScript + Three.js + Tailwind CSS + Recharts**, desenvolvida para simular e visualizar com rigor técnico um **tanque industrial cúbico/retangular de 5,00 m de comprimento, 5,00 m de largura e 4,00 m de altura** (volume nominal de **100 m³ = 100.000 Litros**).

No centro geométrico do tanque há um **agitador mecânico vertical** com acionamento por motorredutor e duplo estágio de pás:
1. **Turbina Axial Inferior de 4 Pás a 45° (PBT - Pitched Blade Turbine):** Diâmetro de 1,65 m, posicionada a 55 cm do fundo para bombeamento axial descendente de alta vazão, promovendo o varrimento do piso e suspensão completa de sedimentos.
2. **Turbina Rushton Intermediária:** 6 pás radiais para dispersão e cisalhamento a meia altura.
3. **4 Chicanas Defletoras Verticais (Baffles):** Instaladas nas paredes internas para evitar o vórtice rotacional livre e canalizar o fluxo em alças de recirculação toroidal ascendente.

---

## 🚀 Como Executar o Projeto Localmente

### Pré-requisitos
- **Node.js** v18 ou superior instalado
- **npm**, **yarn** ou **pnpm**

### Instalação e Execução

1. Entre na pasta `tanque-agitador/` do repositório Oficina.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
4. Acesse no seu navegador:
   ```
   http://localhost:3000
   ```

**Publicado em:** <https://gilsonbolivar-maker.github.io/Oficina/tanque-agitador/> — o workflow do GitHub Pages compila o app a cada push na `main`.

### Comandos Disponíveis
- `npm run dev`: Inicia o servidor Vite na porta 3000.
- `npm run build`: Compila a aplicação para produção na pasta `dist/`.
- `npm run preview`: Visualiza o build de produção localmente.
- `npm run lint`: Valida o TypeScript (`tsc --noEmit`).

---

## 🔬 Fundamentos Físicos & Equações Implementadas

### 1. Lei de Stokes (Decantação Gravitacional)
Quando o agitador está desligado (0 RPM) ou em velocidade subcrítica, a gravidade atua sobre os sólidos mais densos que o fluido ($\rho_p > \rho_f$), gerando velocidade terminal de decantação:
$$v_s = \frac{g \cdot (\rho_p - \rho_f) \cdot d_p^2}{18 \cdot \mu}$$
*Onde $g = 9,81\text{ m/s}^2$, $\rho_p$ é a densidade das partículas, $\rho_f$ é a densidade do fluido, $d_p$ o diâmetro da partícula e $\mu$ a viscosidade dinâmica.*

### 2. Critério de Zwietering ($N_{js}$ - Off-Bottom Suspension)
Determina a velocidade crítica mínima em RPM para suspensão total off-bottom:
$$N_{js} = s \cdot \nu^{0,1} \cdot \left[ \frac{g \cdot (\rho_p - \rho_f)}{\rho_f} \right]^{0,45} \cdot d_p^{0,2} \cdot X^{0,13} \cdot D^{-0,85}$$

### 3. Número de Reynolds do Agitador
$$Re = \frac{\rho_f \cdot N \cdot D^2}{\mu}$$
Indica a transição para regime turbulento ($Re > 10.000$).

### 4. Potência Mecânica e Torque
$$P = \rho_f \cdot N^3 \cdot \left( N_{p,PBT} \cdot D_{PBT}^5 + N_{p,R} \cdot D_R^5 \cdot f_{submersa} \right)$$
*Soma por impelidor: PBT-45° ($N_p \approx 1{,}27$; $D = 1{,}65$ m) + Rushton ($N_p \approx 5{,}0$; $D = 1{,}40$ m a 2,10 m do fundo), que só conta enquanto estiver submersa.*
$$\text{Torque} = \frac{P}{2 \pi N}$$

---

## 🛠️ Tecnologias Utilizadas

- **React 19 & TypeScript**
- **Three.js** (WebGL 3D, PBR Materials, RoomEnvironment, OrbitControls)
- **Recharts** (Gráfico em tempo real de Potência em kW e Torque em N·m nos últimos 60s)
- **Tailwind CSS v4**
- **Lucide Icons**
- **Web Audio API** (Síntese sonora procedural do motor elétrico e turbulência)

---

**Autor / Desenvolvedor:** Gilson Bolivar  
**Licença:** MIT

**Versão:** aparece ao lado do título; mora em `src/versao.ts` e `public/sw.js`.
