@extends('templates/wrapper', [
    'css' => ['body' => 'bg-neutral-900']
])

@section('assets')
    <link rel="stylesheet" href="/assets/custom-auth-3d.css?v=2">
@endsection

@section('container')
    <div id="app"></div>
@endsection

@section('scripts')
    @parent
    <script src="/assets/custom-auth-3d.js?v=4"></script>
@endsection
