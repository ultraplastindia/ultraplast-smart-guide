import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import RequireApproved from './components/RequireApproved'
import Home from './pages/Home'
import Login from './pages/Login'
import { Denied, Pending } from './pages/Status'
import RequirePermission from './components/RequirePermission'
import AdminAccess from './pages/AdminAccess'
import Categories from './pages/Categories'
import Catalogue from './pages/Catalogue'
import ProductDetail from './pages/ProductDetail'
import Explorer from './pages/Explorer'
import AdminImport from './pages/AdminImport'
import AdminReview from './pages/AdminReview'
import Documents from './pages/Documents'
import BomPage from './pages/Bom'
import Compare from './pages/Compare'
import AdminProducts from './pages/AdminProducts'
import AdminCategories from './pages/AdminCategories'
import AdminImages from './pages/AdminImages'
import AdminShare from './pages/AdminShare'
import SharePage from './pages/SharePage'
import AdminPageImages from './pages/AdminPageImages'
import AdminFiles from './pages/AdminFiles'
import AdminDashboard from './pages/AdminDashboard'
import { Profile } from './pages/Account'
import Dashboard from './pages/Dashboard'
import Help from './pages/Help'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/request-access" element={<Login />} />
      <Route path="/pending" element={<Pending />} />
      <Route path="/denied" element={<Denied />} />
      <Route path="/share/:token" element={<SharePage />} />
      <Route element={<RequireApproved />}>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="categories" element={<Categories />} />
          <Route path="explorer" element={<Explorer />} />
          <Route path="catalogue" element={<Catalogue />} />
          <Route path="products/:id" element={<ProductDetail />} />
          <Route path="compare" element={<Compare />} />
          <Route path="documents" element={<Documents />} />
          <Route path="bom" element={<BomPage />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route element={<RequirePermission permission="manage_users" />}>
            <Route path="admin/access" element={<AdminAccess />} />
          </Route>
          <Route element={<RequirePermission permission="manage_imports" />}>
            <Route path="admin/page-images" element={<AdminPageImages />} />
            <Route path="admin/files" element={<AdminFiles />} />
            <Route path="admin/import" element={<AdminImport />} />
          </Route>
          <Route element={<RequirePermission permission="manage_catalogue" />}>
            <Route path="admin" element={<AdminDashboard />} />
            <Route path="admin/review" element={<AdminReview />} />
            <Route path="admin/products" element={<AdminProducts />} />
            <Route path="admin/products/:id" element={<AdminProducts />} />
            <Route path="admin/categories" element={<AdminCategories />} />
            <Route path="admin/images" element={<AdminImages />} />
          </Route>
          <Route element={<RequirePermission permission="create_share_links" />}>
            <Route path="admin/share" element={<AdminShare />} />
          </Route>
          <Route path="help" element={<Help />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
