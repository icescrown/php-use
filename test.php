<?php 

use App\Models\{Post, PostTag, User}; 
use Illuminate\Support\Facades\{Soo, Depart, DB, Route};

class TestClass 
{ 
    public function testMethod() 
    { 
        // 只使用了User和DB类 
        $user = new User(); 
        $data = DB::table('users')->get(); 
        return $user; 
    } 

}