export default function PageContainer({ children, className = "", width = "max-w-5xl" }) {
  return (
    <div className={`mx-auto w-full max-w-full min-w-0 ${width} px-4 sm:px-6 ${className}`}>{children}</div>
  );
}
