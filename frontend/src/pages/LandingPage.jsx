import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import HowItWorks from '../components/HowItWorks'
import LiveDemo from '../components/LiveDemo'
import FeatureGrid from '../components/FeatureGrid'
import Stats from '../components/Stats'
import Pricing from '../components/Pricing'
import FinalCTA from '../components/FinalCTA'
import Footer from '../components/Footer'

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-background">
      <Navbar />
      <main className="relative z-[2]">
        <Hero />
        <HowItWorks />
        <LiveDemo />
        <FeatureGrid />
        <Stats />
        <Pricing />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
