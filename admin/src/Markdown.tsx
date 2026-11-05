import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
export default function Markdown({body}:{body:string}) {
 return <div className="prose"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{a:({children,href})=><a href={href} rel="noopener noreferrer">{children}</a>,img:({src,alt})=><img src={src} alt={alt||"文章配图"} loading="lazy"/>}}>{body}</ReactMarkdown></div>;
}
