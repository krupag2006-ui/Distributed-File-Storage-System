import { motion } from 'framer-motion';
import { FaArrowRight } from 'react-icons/fa';

const FeatureCard = ({ icon: Icon, title, description, buttonText, onClick }) => {
  return (
    <motion.article
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      className="group flex h-full flex-col justify-between rounded-md border border-white/70 bg-white/85 p-6 shadow-xl shadow-indigo-950/10 backdrop-blur"
    >
      <div>
        <div className="mb-5 grid h-14 w-14 place-items-center rounded-md bg-gradient-to-br from-indigo-600 to-purple-600 text-2xl text-white shadow-lg shadow-indigo-500/25">
          <Icon />
        </div>
        <h2 className="text-xl font-bold text-slate-950">{title}</h2>
        <p className="mt-3 min-h-14 text-sm leading-6 text-slate-600">{description}</p>
      </div>

      <button
        type="button"
        onClick={onClick}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700"
      >
        {buttonText}
        <FaArrowRight className="text-xs transition group-hover:translate-x-1" />
      </button>
    </motion.article>
  );
};

export default FeatureCard;
